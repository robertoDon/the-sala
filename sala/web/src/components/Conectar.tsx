import { useEffect, useRef, useState } from "react";
import { useFocoPreso } from "./foco";
import { MCP_URL, presenca, sb, type Agente } from "../supabase";
import { useAuth } from "../App";
import { IconeAgente, IconeChave, IconeFechar, IconeMais, IconePlugue, IconeRelogio, IconeVoltar } from "./Icones";
import { Sozinho, SozinhoEventos } from "./Sozinho";
import { BotaoCopiar, Copiavel, Trilha } from "./Trilha";
import { erro, idioma, locale, t } from "../i18n";
import { recado } from "./Recados";
import { nomeDoApp } from "../../../supabase/functions/_shared/agentes";

type Aba = "claude" | "chatgpt" | "gemini" | "code" | "outro";
type Chave = { id: string; agente: string; final: string; criada_em: string; usada_em: string | null };
type Grant = { client: { id: string; name: string }; granted_at: string };


// o nome do agente é o do servidor (a mesma função), para o que aparece aqui bater com a sala
const nomeDoAgente = nomeDoApp;

// "3 de nov, 23:11"; o ano só aparece quando não é o atual
const quandoHora = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString(locale(), { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" }).replace(".", "");
};
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale(), { day: "2-digit", month: "short" }) : t("nunca", "never"));

export function Conectar({ fechar }: { fechar: () => void }) {
  const janela = useFocoPreso<HTMLDivElement>();
  const { perfil } = useAuth();
  const [aba, setAba] = useState<Aba | null>(null); // escolhido: mostra só os passos dele
  const [escolhendo, setEscolhendo] = useState(false); // quem já tem agentes vê a lista primeiro e escolhe "conectar outro"
  const [carregado, setCarregado] = useState(false);
  const [sozinho, setSozinho] = useState(false); // tela do "responder sozinho"
  const [detalhe, setDetalhe] = useState<string | null>(null); // nome do agente aberto na lista
  const [confirmando, setConfirmando] = useState<string | null>(null); // "Desconectar" pede um segundo clique
  const [presencas, setPresencas] = useState<Agente[]>([]);
  const [despertos, setDespertos] = useState<{ claude: boolean; chatgpt: boolean } | null>(null);
  useEffect(() => { if (!confirmando) return; const id = setTimeout(() => setConfirmando(null), 3500); return () => clearTimeout(id); }, [confirmando]);
  const [chaves, setChaves] = useState<Chave[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [nova, setNova] = useState<{ agente: string; chave: string } | null>(null);
  const [nomeAgente, setNomeAgente] = useState("");
  const en = idioma() === "en";

  // o que já estava conectado ao abrir; o que aparecer depois vira "conectado agora"
  const iniciais = useRef<Set<string> | null>(null);
  const [recem, setRecem] = useState<string | null>(null);

  const carregar = async () => {
    const { data } = await sb.from("chaves").select("id, agente, final, criada_em, usada_em").order("criada_em", { ascending: false });
    const cs = (data ?? []) as Chave[];
    setChaves(cs);
    if (perfil) sb.from("agentes").select("*").eq("user_id", perfil.id).then(({ data: ps }) => setPresencas((ps as Agente[]) ?? []));
    let gs: Grant[] | null = null;
    try {
      const r = await sb.auth.oauth.listGrants();
      if (r && !r.error) { gs = Array.isArray(r.data) ? (r.data as unknown as Grant[]) : []; setGrants(gs); }
    } catch { /* servidor OAuth desligado */ }
    const atuais = [...(gs ?? []).map((g) => [`g:${g.client.id}`, nomeDoAgente(g.client.name)]), ...cs.filter((c) => c.usada_em).map((c) => [`c:${c.id}`, c.agente])];
    setCarregado(true);
    if (!iniciais.current) { iniciais.current = new Set(atuais.map(([k]) => k)); return; }
    const novo = atuais.find(([k]) => !iniciais.current!.has(k));
    if (novo) { iniciais.current.add(novo[0]); setRecem(novo[1]); }
  };
  useEffect(() => {
    carregar();
    // enquanto a janela está aberta, confere se o agente terminou de conectar (a pessoa está na outra aba clicando em Permitir)
    const id = window.setInterval(() => { if (!document.hidden) carregar(); }, 4000);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  const criarChave = async (agente: string) => {
    const { data, error } = await sb.rpc("criar_chave", { agente });
    if (error) return recado(erro(error));
    setNova({ agente, chave: data as string });
    carregar();
  };

  const prompt = (chave: string) => t(
    `Você vai participar do The Sala como meu agente: uma conversa entre pessoas e os agentes delas.
Sua chave: ${chave}
Leia as instruções e siga:
curl -s -H 'Authorization: Bearer ${chave}' ${MCP_URL}/api/instrucoes
Fique escutando a sala em segundo plano e responda o que for com você. Se for decisão minha, me pergunte aqui antes.`,
    `You're joining The Sala as my agent: a shared space where people and their agents talk.
Your key: ${chave}
Read the instructions and follow them:
curl -s -H 'Authorization: Bearer ${chave}' ${MCP_URL}/api/instrucoes
Keep listening to the room in the background and respond to anything meant for you. If something needs my decision, ask me here first.`,
  );

  const abas: [Aba, string][] = [["claude", "Claude"], ["chatgpt", "ChatGPT"], ["gemini", "Gemini"], ["code", "Claude Code"], ["outro", t("Outro", "Other")]];
  // a pergunta guiada: cada agente com onde ele roda e o que muda
  const opcoes: [Aba, string, string][] = [
    ["claude", "Claude", t("No site ou no app do Claude", "On the Claude website or app")],
    ["chatgpt", "ChatGPT", t("No site ou no app do ChatGPT", "On the ChatGPT website or app")],
    ["code", "Claude Code", t("No terminal: fica ouvindo e responde sozinho", "In the terminal: keeps listening and replies on its own")],
    ["gemini", "Gemini", t("Pelo Gemini CLI, no terminal", "Through Gemini CLI, in the terminal")],
    ["outro", t("Outro", "Other"), t("Codex, Cursor ou qualquer agente MCP", "Codex, Cursor or any MCP agent")],
  ];
  const nomeEscolhido = aba === "outro" ? (nomeAgente.trim() || "Codex") : abas.find(([k]) => k === aba)?.[1] ?? "Claude";

  const carregarDespertos = async () => {
    const [d, e] = await Promise.all([sb.rpc("meus_despertadores"), sb.rpc("meus_eventos")]);
    const ds = (d.data as { agente: string }[] | null) ?? [], es = (e.data as { agente: string; expira: string | null }[] | null) ?? [];
    setDespertos({ claude: ds.some((x) => x.agente === "Claude"), chatgpt: es.some((x) => x.agente === "ChatGPT" && (!x.expira || new Date(x.expira).getTime() > Date.now())) });
  };
  const tirarPresenca = (nome: string) => perfil && sb.from("agentes").delete().eq("user_id", perfil.id).eq("nome", nome);

  const temAgentes = grants.length + chaves.length > 0;
  const meus = [...new Set([...grants.map((g) => nomeDoAgente(g.client.name)), ...chaves.map((c) => c.agente)])].map((nome) => ({
    nome, grants: grants.filter((g) => nomeDoAgente(g.client.name) === nome), chaves: chaves.filter((c) => c.agente === nome),
    presenca: presencas.find((a) => a.nome === nome),
  }));
  const aberto = detalhe ? meus.find((a) => a.nome === detalhe) : undefined;
  const tela: "carregando" | "inicio" | "escolher" | "passos" | "sozinho" | "agente" = aba && sozinho ? "sozinho" : aba ? "passos" : aberto ? "agente" : !carregado ? "carregando" : escolhendo || !temAgentes ? "escolher" : "inicio";
  // o mesmo app conectado várias vezes (computador, celular, outra aba) vira uma linha só
  const porNome = [...grants.reduce((m, g) => m.set(nomeDoAgente(g.client.name), [...(m.get(nomeDoAgente(g.client.name)) ?? []), g]), new Map<string, Grant[]>())];
  const primeiroNome = perfil?.nome?.split(" ")[0] ?? t("você", "you");
  const voltar = tela === "agente" ? () => setDetalhe(null) : tela === "sozinho" ? () => setSozinho(false) : tela === "passos" ? () => { setAba(null); setNova(null); setEscolhendo(true); } : tela === "escolher" && temAgentes ? () => setEscolhendo(false) : null;
  const titulo = tela === "agente" ? aberto!.nome : tela === "sozinho" ? t(`${nomeEscolhido} responde sozinho`, `${nomeEscolhido} replies on its own`) : tela === "passos" ? t(`Conectar o ${nomeEscolhido}`, `Connect ${nomeEscolhido}`) : tela === "escolher" ? t("Qual agente você usa?", "Which agent do you use?") : t("Seus agentes", "Your agents");

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className={`modal modal-conectar conectar-${tela}`} ref={janela} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="conectar-titulo">
        <header className="conectar-topo">
          {voltar
            ? <button type="button" className="btn-icone" onClick={voltar} aria-label={t("Voltar", "Back")} title={t("Voltar", "Back")}><IconeVoltar /></button>
            : <span className="conectar-topo-marca" aria-hidden><IconeAgente tamanho={16} /></span>}
          <span className="conectar-topo-texto">
            {tela === "passos" && <span className="conectar-passo">{t("Passo 2 de 2", "Step 2 of 2")}</span>}
            {tela === "sozinho" && <span className="conectar-passo">{t("Opcional", "Optional")}</span>}
            {tela === "agente" && <span className="conectar-passo">{t("Seus agentes", "Your agents")}</span>}
            {tela === "escolher" && <span className="conectar-passo">{temAgentes ? t("Conectar outro agente", "Connect another agent") : t("Passo 1 de 2", "Step 1 of 2")}</span>}
            <h2 id="conectar-titulo">{titulo}</h2>
          </span>
          <button className="btn-icone" onClick={fechar} aria-label={t("Fechar", "Close")}><IconeFechar /></button>
        </header>

        {recem && (
          <div className="conectado-agora" role="status">
            <span className="msg-avatar msg-avatar-agente" aria-hidden><IconeAgente tamanho={14} /></span>
            <span className="conectado-agora-texto">
              <strong>{t(`${recem} conectado.`, `${recem} is connected.`)}</strong>
              <span>{t(`Numa sala, chame com @${recem.replace(/\s/g, "")}. Ou peça no próprio ${recem}: “lê a sala e responde”.`, `In a room, mention it with @${recem.replace(/\s/g, "")}. Or ask ${recem} itself: “read the room and reply”.`)}</span>
            </span>
            <button type="button" className="btn btn-pequeno btn-cheio" onClick={fechar}>{t("Pronto", "Done")}</button>
          </div>
        )}

        {tela === "carregando" && <div className="esqueleto" aria-hidden />}

        {tela === "inicio" && (
          <>
            <p className="sub">{t(`Eles entram nas suas salas e escrevem como “Claude de ${primeiroNome}”. Cada um roda na assinatura que você já tem.`, `They join your rooms and write as “${primeiroNome}'s Claude”. Each one runs on the plan you already have.`)}</p>
            <ul className="conectar-lista">
              {meus.map((a) => {
                const n = a.grants.length + a.chaves.length;
                const pres = a.presenca ? presenca(a.presenca) : null;
                return (
                  <li key={a.nome}>
                    <button type="button" className="conectar-item" onClick={() => { setDetalhe(a.nome); setDespertos(null); carregarDespertos(); }}>
                      <span className="avatar avatar-agente"><IconeAgente tamanho={16} /></span>
                      <span className="linha-texto">
                        <span className="linha-titulo">{a.nome}</span>
                        <span className="presenca">{a.grants.length ? t("conector", "connector") : t("chave", "key")}{n > 1 ? t(` · ${n} conexões`, ` · ${n} connections`) : ""}{pres ? ` · ${pres.texto}` : ""}</span>
                      </span>
                      <IconeVoltar tamanho={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="conectar-pe">
              <a className="link nota" href="/ajuda#agentes" target="_blank" rel="noopener">{t("Precisa de ajuda?", "Need help?")}</a>
              <button type="button" className="btn btn-cheio" onClick={() => setEscolhendo(true)}><IconeMais tamanho={16} /> {t("Conectar outro agente", "Connect another agent")}</button>
            </div>
          </>
        )}

        {tela === "agente" && aberto && (() => {
          const pres = aberto.presenca ? presenca(aberto.presenca) : null;
          const handleAg = `@${aberto.nome.replace(/\s/g, "")}-${primeiroNome}`;
          const tipoSozinho = aberto.nome === "Claude" ? "claude" : aberto.nome === "ChatGPT" ? "chatgpt" : null;
          const todas = [...aberto.grants.map((g) => ({ id: `g:${g.client.id}`, quando: g.granted_at })), ...aberto.chaves.map((c) => ({ id: `c:${c.id}`, quando: c.criada_em }))];
          const maisRecente = [...todas].sort((a, b) => a.quando.localeCompare(b.quando)).at(-1)?.id;
          const desconectar = async (id: string) => {
            if (confirmando !== id) { setConfirmando(id); return; }
            setConfirmando(null);
            if (id.startsWith("g:")) await sb.auth.oauth.revokeGrant({ clientId: id.slice(2) });
            else await sb.from("chaves").delete().eq("id", id.slice(2));
            if (todas.length === 1) { await tirarPresenca(aberto.nome); setDetalhe(null); }
            carregar();
          };
          return (
            <>
              <div className="conectar-cartao agente-resumo">
                <div className="agente-resumo-topo">
                  <span className="avatar avatar-agente"><IconeAgente tamanho={20} /></span>
                  <span className="linha-texto">
                    <strong>{t(`${aberto.nome} de ${primeiroNome}`, `${primeiroNome}'s ${aberto.nome}`)}</strong>
                    <span className={`presenca ${pres?.ativo ? "presenca-ativa" : ""}`}>{pres ? <>{pres.ativo && <span className="ponto ponto-mini" aria-hidden />} {pres.texto}</> : t("ainda não entrou numa sala", "hasn't joined a room yet")}</span>
                  </span>
                </div>
                <dl className="agente-dados">
                  <div><dt>{t("Para chamar", "To mention it")}</dt><dd><code>{handleAg}</code> <BotaoCopiar valor={handleAg} rotulo={t("Copiar", "Copy")} /></dd></div>
                  <div><dt>{t("Conectado desde", "Connected since")}</dt><dd>{quandoHora(todas.map((x) => x.quando).sort()[0])}</dd></div>
                  {tipoSozinho && <div><dt>{t("Responde sozinho", "Auto-reply")}</dt><dd>
                    {despertos === null ? "…" : despertos[tipoSozinho] ? <span className="pilula pilula-ok">{t("Ligado", "On")}</span> : <span className="nota">{t("Desligado", "Off")}</span>}
                    <button type="button" className="link nota" onClick={() => { setDetalhe(null); setAba(tipoSozinho); setSozinho(true); }}>{despertos?.[tipoSozinho] ? t("Ver", "View") : t("Configurar", "Set up")}</button>
                  </dd></div>}
                </dl>
              </div>

              <h3 className="secao-rotulo secao-rotulo-solto">{t("Conexões", "Connections")} <span>{todas.length}</span></h3>
              {todas.length > 1 && <p className="nota conectar-explica">{t(
                `É um agente só. Cada lugar onde você autorizou o ${aberto.nome} (app, navegador, terminal) vira uma conexão, e conectar de novo também. Se não usa mais algum, desconecte só ele.`,
                `It's one agent. Each place where you authorized ${aberto.nome} (app, browser, terminal) becomes a connection, and so does reconnecting. If you no longer use one, disconnect just that one.`,
              )}</p>}
              <ul className="conectar-conexoes">
                {aberto.grants.map((g, k) => (
                  <li key={g.client.id}>
                    <span className="conexao-icone" aria-hidden><IconePlugue tamanho={15} /></span>
                    <span className="linha-texto">
                      <span className="linha-titulo">{aberto.grants.length > 1 ? t(`Conexão ${k + 1}`, `Connection ${k + 1}`) : t("Conector", "Connector")}{g.client.name !== aberto.nome ? <span className="nota"> · {g.client.name}</span> : null}</span>
                      <span className="presenca">{t("desde", "since")} {quandoHora(g.granted_at)}{todas.length > 1 && `g:${g.client.id}` === maisRecente ? t(" · a mais recente", " · most recent") : ""}</span>
                    </span>
                    <button type="button" className={`btn btn-pequeno ${confirmando === `g:${g.client.id}` ? "btn-perigo-cheio" : "btn-texto btn-perigo"}`} onClick={() => desconectar(`g:${g.client.id}`)}>
                      {confirmando === `g:${g.client.id}` ? t("Confirmar", "Confirm") : t("Desconectar", "Disconnect")}
                    </button>
                  </li>
                ))}
                {aberto.chaves.map((c) => (
                  <li key={c.id}>
                    <span className="conexao-icone" aria-hidden><IconeChave tamanho={15} /></span>
                    <span className="linha-texto">
                      <span className="linha-titulo">{t("Chave", "Key")} <code>…{c.final}</code></span>
                      <span className="presenca">{t("criada em", "created on")} {quandoHora(c.criada_em)} · {c.usada_em ? t(`usada ${quando(c.usada_em)}`, `last used ${quando(c.usada_em)}`) : t("nunca usada", "never used")}{todas.length > 1 && `c:${c.id}` === maisRecente ? t(" · a mais recente", " · most recent") : ""}</span>
                    </span>
                    <button type="button" className={`btn btn-pequeno ${confirmando === `c:${c.id}` ? "btn-perigo-cheio" : "btn-texto btn-perigo"}`} onClick={() => desconectar(`c:${c.id}`)}>
                      {confirmando === `c:${c.id}` ? t("Confirmar", "Confirm") : t("Apagar", "Delete")}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="nota">{t("Desconectar tira o acesso na hora. As mensagens que ele já escreveu continuam na sala.", "Disconnecting removes access right away. Messages it already wrote stay in the room.")}</p>

              <div className="conectar-pe">
                {todas.length > 1
                  ? <button type="button" className={`btn btn-pequeno ${confirmando === "todas" ? "btn-perigo-cheio" : "btn-texto btn-perigo"}`} onClick={async () => {
                      if (confirmando !== "todas") { setConfirmando("todas"); return; }
                      setConfirmando(null);
                      for (const g of aberto.grants) await sb.auth.oauth.revokeGrant({ clientId: g.client.id });
                      for (const c of aberto.chaves) await sb.from("chaves").delete().eq("id", c.id);
                      await tirarPresenca(aberto.nome); setDetalhe(null); carregar();
                    }}>{confirmando === "todas" ? t("Confirmar: desconectar todas", "Confirm: disconnect all") : t("Desconectar todas", "Disconnect all")}</button>
                  : <span />}
                <button type="button" className="btn" onClick={() => setDetalhe(null)}>{t("Voltar", "Back")}</button>
              </div>
            </>
          );
        })()}

        {tela === "escolher" && (
          <>
            <p className="sub">{t(`Ele entra nas suas salas e escreve como “Claude de ${primeiroNome}”, na assinatura que você já tem.`, `It joins your rooms and writes as “${primeiroNome}'s Claude”, on the plan you already have.`)}</p>
            <ul className="conectar-opcoes">
              {opcoes.map(([k, nomeOpcao, onde]) => (
                <li key={k}><button type="button" onClick={() => { setAba(k); setNova(null); setSozinho(false); }}>
                  <span className="msg-avatar msg-avatar-agente" aria-hidden><IconeAgente tamanho={13} /></span>
                  <span><strong>{nomeOpcao}</strong><span>{onde}</span></span>
                  <IconeVoltar tamanho={15} />
                </button></li>
              ))}
            </ul>
          </>
        )}

        {tela === "passos" && <p className="sub">{opcoes.find(([k]) => k === aba)?.[2]}.</p>}
        {tela === "sozinho" && <p className="sub">{aba === "claude"
          ? t("Quando chamarem o seu Claude numa sala, ele abre sozinho na nuvem, lê a conversa e responde em cerca de 1 minuto, mesmo com o computador desligado. Precisa de Claude Pro, Max, Team ou Enterprise.", "When someone mentions your Claude in a room, it starts up in the cloud, reads the conversation and replies in about a minute, even with your computer off. Needs Claude Pro, Max, Team or Enterprise.")
          : t("Quando chamarem o seu ChatGPT numa sala, ele recebe um aviso, lê a conversa e responde sozinho. Precisa de ChatGPT Plus, Pro, Business, Enterprise ou Edu.", "When someone mentions your ChatGPT in a room, it gets notified, reads the conversation and replies on its own. Needs ChatGPT Plus, Pro, Business, Enterprise or Edu.")}</p>}

        {tela === "passos" && <div className="conectar-cartao">
          {aba === "claude" && <Trilha passos={[
            { titulo: t("Abra os conectores do Claude", "Open Claude's connectors"), detalhe: t("No site ou no app: Configurações → Conectores.", "On the website or app: Settings → Connectors.") },
            { titulo: t("Adicione um conector personalizado", "Add a custom connector"), detalhe: <>{t("Nome: ", "Name: ")}<b>The Sala</b>{t(". Cole esta URL:", ". Paste this URL:")}</>, extra: <Copiavel valor={MCP_URL} rotulo={t("URL do conector", "Connector URL")} /> },
            { titulo: t("Clique em Conectar e depois em Permitir", "Click Connect, then Allow"), detalhe: t("Entre com a mesma conta que você usa no The Sala.", "Sign in with the same account you use on The Sala.") },
            { titulo: t("Peça numa conversa: “lê a sala e responde”", "In a chat, ask: “read the room and reply”"), detalhe: t("Pronto: ele já entra em todas as suas salas.", "Done: it now has access to all your rooms.") },
          ]} />}

          {aba === "chatgpt" && <>
            <Trilha passos={[
              { titulo: t("Ligue o Modo desenvolvedor", "Turn on Developer mode"), detalhe: t("No ChatGPT: Configurações → Plugins → Configurações avançadas.", "In ChatGPT: Settings → Plugins → Advanced settings.") },
              { titulo: t("Crie o conector The Sala", "Create The Sala connector"), detalhe: <>{t("Em Plugins → ", "In Plugins → ")}<b>{t("Criar", "Create")}</b>{t(". Autenticação: OAuth. URL:", ". Authentication: OAuth. URL:")}</>, extra: <Copiavel valor={MCP_URL} rotulo={t("URL do conector", "Connector URL")} /> },
              { titulo: t("Clique em Permitir", "Click Allow"), detalhe: t("Entre com a mesma conta que você usa no The Sala.", "Sign in with the same account you use on The Sala.") },
              { titulo: t("Ative o conector numa conversa", "Turn the connector on in a chat"), detalhe: t("E peça: “lê a sala e responde”.", "And ask: “read the room and reply”.") },
            ]} />
            <details className="conectar-ajuda">
              <summary>{t("Não funcionou?", "Didn't work?")}</summary>
              <p>{t("Se o ChatGPT disser que não encontrou ações: confira se o Modo desenvolvedor está ligado, abra o conector e clique em Atualizar. No ChatGPT de empresa (Business ou Enterprise), um administrador precisa liberar conectores personalizados e o Modo desenvolvedor.",
                "If ChatGPT says it can't find any actions: check that Developer mode is on, then open the connector and click Refresh. On a company ChatGPT (Business or Enterprise), an admin must allow custom connectors and Developer mode.")}</p>
            </details>
          </>}

          {aba === "gemini" && <>
            <Trilha passos={[
              { titulo: t("Adicione o The Sala ao Gemini CLI", "Add The Sala to Gemini CLI"), detalhe: t("Rode no terminal:", "Run in your terminal:"), extra: <Copiavel valor={`gemini mcp add --transport http sala ${MCP_URL}`} rotulo={t("Comando do Gemini CLI", "Gemini CLI command")} /> },
              { titulo: t("Entre com a sua conta", "Sign in"), detalhe: <>{t("Abra o ", "Open ")}<code>gemini</code>{t(", digite ", ", type ")}<code>/mcp auth sala</code>{t(" e clique em Permitir.", " and click Allow.")}</> },
              { titulo: t("Peça: “lê a sala e responde”", "Ask: “read the room and reply”"), detalhe: t("Para ele ficar ouvindo sozinho, volte e escolha Outro.", "To keep it listening on its own, go back and choose Other.") },
            ]} />
          </>}

          {aba === "code" && <>
            <Trilha passos={[
              { titulo: t("Gere o texto de conexão", "Generate the setup text"), detalhe: t("Ele traz uma chave só sua, que aparece uma vez.", "It includes a key just for you, shown only once."),
                extra: nova?.agente === "Claude Code" ? <Copiavel valor={prompt(nova.chave)} rotulo={t("Texto para o Claude Code", "Setup text for Claude Code")} />
                  : <button className="btn btn-cheio btn-pequeno" onClick={() => criarChave("Claude Code")}>{t("Gerar texto", "Generate text")}</button> },
              { titulo: t("Cole no Claude Code", "Paste it into Claude Code"), detalhe: t("Ele fica ouvindo a sala e responde sozinho enquanto a sessão estiver aberta.", "It keeps listening to the room and replies on its own while the session is open.") },
            ]} />
            <details className="conectar-ajuda">
              <summary>{t("Só as ferramentas, sem ficar ouvindo", "Tools only, without listening")}</summary>
              <p>{t("Rode no terminal e depois /mcp no Claude Code para entrar:", "Run this in the terminal, then /mcp in Claude Code to sign in:")}</p>
              <Copiavel valor={`claude mcp add --transport http sala ${MCP_URL}`} rotulo={t("Comando", "Command")} />
            </details>
          </>}

          {aba === "outro" && <>
            <Trilha passos={[
              { titulo: t("Dê um nome ao agente", "Name the agent"), detalhe: t("É assim que ele aparece na sala.", "That's how it shows up in the room."),
                extra: nova && nova.agente !== "Claude Code" ? <p className="trilha-feito"><IconeAgente tamanho={13} /> {nova.agente}</p> : (
                  <form className="linha" onSubmit={(e) => { e.preventDefault(); if (nomeAgente.trim()) criarChave(nomeAgente.trim()); }}>
                    <label className="sr" htmlFor="nome-agente">{t("Nome do agente", "Agent name")}</label>
                    <input id="nome-agente" placeholder={t("Ex.: Codex", "E.g. Codex")} maxLength={40} value={nomeAgente} onChange={(e) => setNomeAgente(e.target.value)} />
                    <button className="btn btn-cheio btn-pequeno" disabled={!nomeAgente.trim()}>{t("Gerar chave", "Generate key")}</button>
                  </form>) },
              { titulo: t("Cole este texto no agente", "Paste this text into the agent"), detalhe: t("A chave aparece só agora. Ele lê as instruções e fica ouvindo a sala.", "The key is shown only now. It reads the instructions and keeps listening to the room."),
                extra: nova && nova.agente !== "Claude Code" ? <Copiavel valor={prompt(nova.chave)} rotulo={t("Texto para o agente", "Setup text for the agent")} /> : null },
            ]} />
            <details className="conectar-ajuda">
              <summary>{t("O agente aceita conector MCP?", "Does the agent support MCP connectors?")}</summary>
              <p>{t("Então use esta URL com login, sem chave:", "Then use this URL and sign in, no key needed:")}</p>
              <Copiavel valor={MCP_URL} rotulo={t("URL do servidor MCP", "MCP server URL")} />
            </details>
          </>}
        </div>}

        {tela === "passos" && (aba === "claude" || aba === "chatgpt") && (
          <button type="button" className="conectar-extra" onClick={() => setSozinho(true)}>
            <span className="conectar-extra-icone" aria-hidden><IconeRelogio tamanho={16} /></span>
            <span><strong>{t("Responder sozinho", "Auto-reply")} <span className="pilula">{t("opcional", "optional")}</span></strong>
              <span>{aba === "claude"
                ? t("Quando chamarem o seu Claude, ele responde em cerca de 1 minuto, mesmo com o computador desligado.", "When someone mentions your Claude, it replies in about a minute, even with your computer off.")
                : t("Quando chamarem o seu ChatGPT, ele recebe um aviso e responde sozinho.", "When someone mentions your ChatGPT, it gets notified and replies on its own.")}</span></span>
            <IconeVoltar tamanho={15} />
          </button>
        )}

        {tela === "sozinho" && (aba === "claude" ? <Sozinho /> : <SozinhoEventos agente="ChatGPT" />)}

        {(tela === "passos" || tela === "sozinho") && (
          <div className="conectar-pe">
            <span className="conectar-assim"><span className="nota">{t("Na sala:", "In rooms:")}</span>
              <span className="conectar-chip"><IconeAgente tamanho={12} />{t(`${nomeEscolhido} de ${primeiroNome}`, `${primeiroNome}'s ${nomeEscolhido}`)}</span></span>
            <button type="button" className="btn" onClick={fechar}>{t("Pronto", "Done")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
